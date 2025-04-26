import { Module } from '@nestjs/common'
import { LikeController } from './like.controller'
import { LikeService } from './like.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { UserModule } from '../user/user.module'

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [LikeController],
  providers: [LikeService],
  exports: [LikeService],
})
export class LikeModule {}