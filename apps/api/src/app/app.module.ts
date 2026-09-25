import { Module } from '@nestjs/common';
import { AnchorController, RootController } from './anchor.controller';
import { AnchorService } from './anchor.service';
import { ChatService } from './chat.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { FamilyService } from './family.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { UserStoreService } from './user-store.service';

@Module({
  controllers: [RootController, AnchorController, AuthController, FilesController],
  providers: [AnchorService, UserStoreService, AuthService, AuthGuard, FilesService, FamilyService, ChatService],
})
export class AppModule {}
