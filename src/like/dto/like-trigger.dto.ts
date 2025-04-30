import {
	IsBoolean,
	IsNotEmpty,
	ValidateNested,
	IsString,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export class FromUser {
	@IsString()
	id!: string

	@IsString()
	avatar!: string

	@IsString()
	name!: string
}

export class LikeTriggerDto extends ConnectionDto {
	@IsBoolean()
	isTrigger!: boolean

	@ValidateNested()
	@Type(() => FromUser)
	@IsNotEmpty()
	fromUser!: FromUser
}
