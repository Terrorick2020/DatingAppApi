import { IsInt, IsString, ValidateIf } from 'class-validator';


export class GetDescComplaintsDto {
    @ValidateIf((o) => o.globVal === undefined)
    @IsInt()
    globId!: number
    
    @ValidateIf((o) => o.globId === undefined)
    @IsString()
    globVal!: string
}
