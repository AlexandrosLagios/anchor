import { Module } from '@nestjs/common';
import { AnchorController } from './anchor.controller';
import { AnchorService } from './anchor.service';

@Module({
  controllers: [AnchorController],
  providers: [AnchorService],
})
export class AppModule {}
