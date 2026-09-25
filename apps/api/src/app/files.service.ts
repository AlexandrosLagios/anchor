import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { del, get, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { databaseConfigured, getPool } from './db';

const MAX_BYTES = 4.5 * 1024 * 1024;

export type UserFile = {
  id: string;
  pathname: string;
  url: string;
  size: number;
  contentType: string;
  originalName: string | null;
  createdAt: string;
};

export type UploadedBytes = {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
};

type FileRow = {
  id: string;
  pathname: string;
  url: string;
  size: string | number;
  content_type: string;
  original_name: string | null;
  created_at: Date;
};

@Injectable()
export class FilesService {
  configured(): boolean {
    return databaseConfigured() && Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  }

  private token(): string {
    const value = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!value) throw new ServiceUnavailableException('Blob storage is not configured');
    return value;
  }

  private mapRow(row: FileRow): UserFile {
    return {
      id: row.id,
      pathname: row.pathname,
      url: row.url,
      size: Number(row.size),
      contentType: row.content_type,
      originalName: row.original_name,
      createdAt: row.created_at.toISOString(),
    };
  }

  async list(userId: string): Promise<UserFile[]> {
    if (!this.configured()) throw new ServiceUnavailableException('File storage is not configured');
    const result = await getPool().query<FileRow>(
      `SELECT id, pathname, url, size, content_type, original_name, created_at
       FROM user_files WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async upload(userId: string, file: UploadedBytes): Promise<UserFile> {
    if (!this.configured()) throw new ServiceUnavailableException('File storage is not configured');
    if (!file?.buffer?.length) throw new BadRequestException('A file is required');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File must be under ${Math.floor(MAX_BYTES / (1024 * 1024))} MB`);
    }

    const safeName = sanitizeFilename(file.originalname || 'upload');
    const pathname = `users/${userId}/${randomUUID()}-${safeName}`;
    const contentType = file.mimetype || 'application/octet-stream';

    const blob = await put(pathname, file.buffer, {
      access: 'private',
      contentType,
      token: this.token(),
      addRandomSuffix: false,
    });

    try {
      const inserted = await getPool().query<FileRow>(
        `INSERT INTO user_files (user_id, pathname, url, size, content_type, original_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, pathname, url, size, content_type, original_name, created_at`,
        [userId, blob.pathname, blob.url, file.size, contentType, safeName],
      );
      return this.mapRow(inserted.rows[0]);
    } catch (error) {
      await del(blob.url, { token: this.token() }).catch(() => undefined);
      throw error;
    }
  }

  async getOwned(userId: string, fileId: string): Promise<FileRow> {
    if (!this.configured()) throw new ServiceUnavailableException('File storage is not configured');
    const result = await getPool().query<FileRow>(
      `SELECT id, pathname, url, size, content_type, original_name, created_at
       FROM user_files WHERE id = $1 AND user_id = $2`,
      [fileId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  async meta(userId: string, fileId: string): Promise<UserFile> {
    return this.mapRow(await this.getOwned(userId, fileId));
  }

  async readStream(userId: string, fileId: string): Promise<{
    stream: ReadableStream;
    contentType: string;
    originalName: string | null;
  }> {
    const row = await this.getOwned(userId, fileId);
    const result = await get(row.pathname, { access: 'private', token: this.token() });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new NotFoundException('Blob missing');
    }
    return {
      stream: result.stream,
      contentType: result.blob?.contentType || row.content_type,
      originalName: row.original_name,
    };
  }

  async remove(userId: string, fileId: string): Promise<void> {
    const row = await this.getOwned(userId, fileId);
    await del(row.url, { token: this.token() });
    await getPool().query(`DELETE FROM user_files WHERE id = $1 AND user_id = $2`, [fileId, userId]);
  }
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'upload';
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, '_').trim().slice(0, 120);
  return cleaned || 'upload';
}
