import { Module } from '@nestjs/common';
import { AnchorController, RootController } from './anchor.controller';
import { AnchorService } from './anchor.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { UserStoreService } from './user-store.service';

@Module({
  controllers: [RootController, AnchorController],
  providers: [AnchorService, UserStoreService, FirebaseAuthGuard],
})
export class AppModule {}
