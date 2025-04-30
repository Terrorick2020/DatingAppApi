import { IsBoolean, ValidateNested, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

class MatchFromUser {
    @IsString()
    telegramId!: string

    @IsString()
    avatar!: string

    @IsString()
    name!: string
}

export class MatchMicroDto extends ConnectionDto {
    @IsBoolean()
    isTrigger!: boolean

    @ValidateNested()
    @Type(() => MatchFromUser)
    fromUser!: MatchFromUser
}
