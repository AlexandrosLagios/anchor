import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard';
import { FilesService } from './files.service';

@Controller('api/files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser | null) {
    requireUser(user);
    return { files: await this.files.list(user.uid), region: 'fra1' };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: Math.floor(4.5 * 1024 * 1024), files: 1 },
    }),
  )
  async upload(
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          size: number;
          mimetype?: string;
          originalname?: string;
        }
      | undefined,
    @CurrentUser() user: AuthUser | null,
  ) {
    requireUser(user);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file is required');
    }
    return this.files.upload(user.uid, file);
  }

  @Get(':id')
  async meta(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    requireUser(user);
    return this.files.meta(user.uid, id);
  }

  @Get(':id/content')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    requireUser(user);
    const { stream, contentType, originalName } = await this.files.readStream(user.uid, id);
    const buffer = Buffer.from(await new Response(stream).arrayBuffer());
    const disposition = originalName
      ? `inline; filename="${originalName.replace(/"/g, '')}"`
      : 'inline';
    return new StreamableFile(buffer, {
      type: contentType,
      disposition,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    requireUser(user);
    await this.files.remove(user.uid, id);
    return { ok: true };
  }
}

function requireUser(user: AuthUser | null): asserts user is AuthUser {
  if (!user) throw new UnauthorizedException('Sign in required');
}
