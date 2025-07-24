import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class FindPsychologistBySelectorDto {
  @ApiProperty({ description: 'ID психолога или имя для поиска' })
  @IsString()
  @IsNotEmpty()
  selector!: string
} 