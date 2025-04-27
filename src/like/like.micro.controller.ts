import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { LikeMicroService } from './like.micro.service'

@Controller()
export class LikeMicroController extends MicroController<LikeMicroService> {
    constructor(protected readonly likeMicroService: LikeMicroService) {
        super(likeMicroService)
    }
}
