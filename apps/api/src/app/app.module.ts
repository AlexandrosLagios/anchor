import { Module } from '@nestjs/common';
import { AnchorController, RootController } from './anchor.controller';
import { AnchorService } from './anchor.service';

@Module({
  controllers: [RootController, AnchorController],
  providers: [AnchorService],
})
export class AppModule {}
