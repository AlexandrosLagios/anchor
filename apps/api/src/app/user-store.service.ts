import { Injectable, Logger } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { ChatLine, Moment } from './anchor.service';
import { adminDb, firebaseAdminConfigured } from './firebase-admin';

@Injectable()
export class UserStoreService {
  private readonly logger = new Logger(UserStoreService.name);

  async persistSnapshot(uid: string, state: { chat: ChatLine[]; moments: Moment[]; activeId?: string }) {
    if (!firebaseAdminConfigured()) return;
    try {
      const ref = adminDb().collection('users').doc(uid);
      await ref.set(
        {
          region: 'eur3',
          lastActiveAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await ref.collection('state').doc('current').set({
        chat: state.chat,
        moments: state.moments,
        activeId: state.activeId ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const moment of state.moments) {
        await ref.collection('moments').doc(moment.id).set({
          ...moment,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      this.logger.warn(`Firestore persist failed for ${uid}: ${String(error)}`);
    }
  }
}
