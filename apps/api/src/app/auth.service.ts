import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseConfigured, getPool } from './db';
import { FamiliesService } from './families.service';

export type AuthUser = { uid: string; email?: string; displayName?: string };

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  region: string;
};

const TOKEN_TTL = '7d';

@Injectable()
export class AuthService {
  constructor(private readonly families: FamiliesService) {}

  configured(): boolean {
    return databaseConfigured() && Boolean(process.env.AUTH_JWT_SECRET?.trim());
  }

  private secret(): string {
    const value = process.env.AUTH_JWT_SECRET?.trim();
    if (!value) throw new Error('AUTH_JWT_SECRET is not configured');
    return value;
  }

  async signToken(user: AuthUser): Promise<string> {
    return jwt.sign(
      { email: user.email, displayName: user.displayName },
      this.secret(),
      { subject: user.uid, expiresIn: TOKEN_TTL },
    );
  }

  async verifyBearer(authorization?: string): Promise<AuthUser | null> {
    if (!authorization?.startsWith('Bearer ') || !this.configured()) return null;
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) return null;
    try {
      const payload = jwt.verify(token, this.secret()) as jwt.JwtPayload;
      const uid = payload.sub;
      if (!uid) return null;
      return {
        uid,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
      };
    } catch {
      return null;
    }
  }

  async signUp(input: {
    email: string;
    password: string;
    displayName: string;
    consents: { terms: boolean; privacy: boolean; marketing: boolean };
  }): Promise<{ user: AuthUser; token: string }> {
    if (!this.configured()) throw new BadRequestException('Auth is not configured');
    if (!input.consents.terms || !input.consents.privacy) {
      throw new BadRequestException('You must accept the Terms and Privacy Policy.');
    }
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes('@')) throw new BadRequestException('Valid email required');
    if (input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const region = process.env.DATA_REGION?.trim() || 'eu-central-1';
    const displayName = input.displayName.trim() || null;
    const pool = getPool();

    try {
      const inserted = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name, region)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, password_hash, display_name, region`,
        [email, passwordHash, displayName, region],
      );
      const row = inserted.rows[0];
      await pool.query(
        `INSERT INTO user_consents (user_id, terms, privacy, marketing)
         VALUES ($1, true, true, $2)`,
        [row.id, Boolean(input.consents.marketing)],
      );
      await pool.query(`INSERT INTO user_states (user_id) VALUES ($1)`, [row.id]);
      await this.families.claimInvites(row.id, row.email);

      const user: AuthUser = {
        uid: row.id,
        email: row.email,
        displayName: row.display_name ?? undefined,
      };
      return { user, token: await this.signToken(user) };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') throw new ConflictException('An account with that email already exists');
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    if (!this.configured()) throw new BadRequestException('Auth is not configured');
    const pool = getPool();
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name, region FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user: AuthUser = {
      uid: row.id,
      email: row.email,
      displayName: row.display_name ?? undefined,
    };
    return { user, token: await this.signToken(user) };
  }

  async me(user: AuthUser): Promise<AuthUser & { region: string }> {
    const pool = getPool();
    const result = await pool.query<{ display_name: string | null; region: string; email: string }>(
      `SELECT email, display_name, region FROM users WHERE id = $1`,
      [user.uid],
    );
    const row = result.rows[0];
    if (!row) throw new UnauthorizedException('Account not found');
    return {
      uid: user.uid,
      email: row.email,
      displayName: row.display_name ?? undefined,
      region: row.region,
    };
  }
}
