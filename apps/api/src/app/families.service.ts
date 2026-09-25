import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { getPool } from './db';

export type FamilyRole = 'owner' | 'member';

export type FamilyMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: FamilyRole;
};

export type FamilyInvite = {
  id: string;
  email: string;
  displayName: string | null;
};

export type FamilyRecord = {
  id: string;
  name: string;
  role: FamilyRole;
  members: FamilyMember[];
  invites: FamilyInvite[];
};

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email.includes('@') || email.length > 320) {
    throw new BadRequestException('Valid email required');
  }
  return email;
}

@Injectable()
export class FamiliesService {
  async list(userId: string): Promise<FamilyRecord[]> {
    const families = await getPool().query<{ id: string; name: string; role: FamilyRole }>(
      `SELECT f.id, f.name, m.role
       FROM families f
       JOIN family_members m ON m.family_id = f.id
       WHERE m.user_id = $1
       ORDER BY f.created_at`,
      [userId],
    );
    return Promise.all(families.rows.map((row) => this.hydrate(row.id, row.name, row.role)));
  }

  async create(userId: string, name: string): Promise<FamilyRecord> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) {
      throw new BadRequestException('Family name must be 1–80 characters');
    }
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO families (name, created_by) VALUES ($1, $2) RETURNING id`,
        [trimmed, userId],
      );
      const id = inserted.rows[0].id;
      await client.query(
        `INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, userId],
      );
      await client.query('COMMIT');
      return this.hydrate(id, trimmed, 'owner');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addMember(
    actorId: string,
    familyId: string,
    input: { email?: string; displayName?: string; password?: string; consents?: boolean },
  ): Promise<{ status: 'existing' | 'created' | 'invited'; family: FamilyRecord }> {
    await this.requireOwner(actorId, familyId);
    const email = normalizeEmail(input.email ?? '');
    const pool = getPool();
    const existing = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
    const found = existing.rows[0];

    if (found) {
      try {
        await pool.query(
          `INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'member')`,
          [familyId, found.id],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('That person is already in this family');
        }
        throw error;
      }
      await pool.query(`DELETE FROM family_invites WHERE family_id = $1 AND email = $2`, [familyId, email]);
      return { status: 'existing', family: await this.one(actorId, familyId) };
    }

    const password = input.password ?? '';
    if (password) {
      if (!input.consents) {
        throw new BadRequestException('Confirm they agreed to the Terms and Privacy Policy.');
      }
      if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      const displayName = input.displayName?.trim() ?? '';
      if (!displayName) throw new BadRequestException('A display name is required for a new account');
      const passwordHash = await bcrypt.hash(password, 12);
      const region = process.env.DATA_REGION?.trim() || 'eu-central-1';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, region)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [email, passwordHash, displayName, region],
        );
        const userId = inserted.rows[0].id;
        await client.query(
          `INSERT INTO user_consents (user_id, terms, privacy, marketing) VALUES ($1, true, true, false)`,
          [userId],
        );
        await client.query(`INSERT INTO user_states (user_id) VALUES ($1)`, [userId]);
        await client.query(
          `INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'member')`,
          [familyId, userId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('An account with that email already exists');
        }
        throw error;
      } finally {
        client.release();
      }
      return { status: 'created', family: await this.one(actorId, familyId) };
    }

    const displayName = input.displayName?.trim() || null;
    await pool.query(
      `INSERT INTO family_invites (family_id, email, display_name, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (family_id, email)
       DO UPDATE SET display_name = EXCLUDED.display_name`,
      [familyId, email, displayName, actorId],
    );
    return { status: 'invited', family: await this.one(actorId, familyId) };
  }

  async removeMember(actorId: string, familyId: string, memberId: string): Promise<FamilyRecord> {
    await this.requireOwner(actorId, familyId);
    if (memberId === actorId) {
      throw new BadRequestException('You stay in the family you created');
    }
    const result = await getPool().query(
      `DELETE FROM family_members WHERE family_id = $1 AND user_id = $2 AND role = 'member'`,
      [familyId, memberId],
    );
    if (!result.rowCount) throw new NotFoundException('That member is not in this family');
    return this.one(actorId, familyId);
  }

  async cancelInvite(actorId: string, familyId: string, inviteId: string): Promise<FamilyRecord> {
    await this.requireOwner(actorId, familyId);
    const result = await getPool().query(`DELETE FROM family_invites WHERE id = $1 AND family_id = $2`, [
      inviteId,
      familyId,
    ]);
    if (!result.rowCount) throw new NotFoundException('Invite not found');
    return this.one(actorId, familyId);
  }

  async claimInvites(userId: string, email: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO family_members (family_id, user_id, role)
       SELECT family_id, $1, 'member'
       FROM family_invites
       WHERE email = $2
       ON CONFLICT (family_id, user_id) DO NOTHING`,
      [userId, email],
    );
    await pool.query(`DELETE FROM family_invites WHERE email = $1`, [email]);
  }

  private async requireOwner(userId: string, familyId: string): Promise<void> {
    const result = await getPool().query<{ role: FamilyRole }>(
      `SELECT role FROM family_members WHERE family_id = $1 AND user_id = $2`,
      [familyId, userId],
    );
    const role = result.rows[0]?.role;
    if (!role) throw new NotFoundException('Family not found');
    if (role !== 'owner') {
      throw new ForbiddenException('Only the person who created the family can change its members');
    }
  }

  private async one(userId: string, familyId: string): Promise<FamilyRecord> {
    const result = await getPool().query<{ id: string; name: string; role: FamilyRole }>(
      `SELECT f.id, f.name, m.role
       FROM families f
       JOIN family_members m ON m.family_id = f.id AND m.user_id = $2
       WHERE f.id = $1`,
      [familyId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Family not found');
    return this.hydrate(row.id, row.name, row.role);
  }

  private async hydrate(id: string, name: string, role: FamilyRole): Promise<FamilyRecord> {
    const pool = getPool();
    const members = await pool.query<{
      user_id: string;
      email: string;
      display_name: string | null;
      role: FamilyRole;
    }>(
      `SELECT u.id AS user_id, u.email, u.display_name, m.role
       FROM family_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.family_id = $1
       ORDER BY m.created_at`,
      [id],
    );
    const invites = await pool.query<{ id: string; email: string; display_name: string | null }>(
      `SELECT id, email, display_name FROM family_invites WHERE family_id = $1 ORDER BY created_at`,
      [id],
    );
    return {
      id,
      name,
      role,
      members: members.rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
      })),
      invites: invites.rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
      })),
    };
  }
}
