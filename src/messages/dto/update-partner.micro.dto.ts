import { IsEnum, IsOptional, ValidateIf } from 'class-validator'
import { EWriteType, ELineStat } from '@/messages/messages.type'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export class UpdateMicroPartnerDto extends ConnectionDto {
	@ValidateIf(o => o.newLineStat === undefined)
	@IsEnum(EWriteType)
	@IsOptional()
	newWriteStat?: EWriteType

	@ValidateIf(o => o.newWriteStat === undefined)
	@IsEnum(ELineStat)
	@IsOptional()
	newLineStat?: ELineStat
}
