import { IsBoolean, IsNotEmpty } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import type { MatchFromUser } from '@/like/like.types'

export class MatchMicroDto extends ConnectionDto {
    @IsBoolean()
    isTrigger!: boolean

    @IsNotEmpty()
    fromUser!: MatchFromUser
}
