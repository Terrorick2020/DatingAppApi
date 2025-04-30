import {
	IsOptional,
	IsString,
	IsNumber,
	IsBoolean,
	ValidateNested,
	ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

class UpdatedMsgData {
	@ValidateIf(o => o.isDeleted === undefined)
	@IsString()
	@IsOptional()
	msg?: string

	@ValidateIf(o => o.msg === undefined)
	@IsBoolean()
	@IsOptional()
	isDeleted?: boolean

	@IsNumber()
	time!: number
}

export class UpdateMicroMsgDto extends ConnectionDto {
	@IsString()
	chatId!: string

	@IsString()
	msgId!: string

	@ValidateIf(o => o.isReaded === undefined)
	@ValidateNested()
	@Type(() => UpdatedMsgData)
	@IsOptional()
	newMsgData?: UpdatedMsgData

	@ValidateIf(o => o.newMsgData === undefined)
	@IsBoolean()
	@IsOptional()
	isReaded?: boolean
}
