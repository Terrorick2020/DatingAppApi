import { Module } from '@nestjs/common'
import { LikeController } from './like.controller'
import { LikeService } from './like.service'
import { PrismaModule } from '~/prisma/prisma.module'
import { MicroModule } from '@/common/abstract/micro/micro.module'
import { UserModule } from '@/user/user.module'
import { LikeMicroController } from './like.micro.controller'
import { LikeMicroService } from './like.micro.service'

@Module({
  imports: [PrismaModule, UserModule, MicroModule],
  controllers: [LikeController, LikeMicroController],
  providers: [LikeService, LikeMicroService],
  exports: [LikeService, LikeMicroService],
})
export class LikeModule {}