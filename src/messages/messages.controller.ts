import {
    Controller,
    Get,
    Body,
    Post,
    Patch,
    Param,
    Delete,
} from '@nestjs/common'
import { MessegesService } from './messages.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'

@Controller('messages')
export class MessagesController {
    constructor( private readonly msgServise: MessegesService ) {}

    @Get()
    async findAll(@Body() findDto: FindDto): Promise<null> {
        return await this.msgServise.findAll(findDto)
    }

    @Post()
    async create(@Body() createDto: CreateDto): Promise<null> {
        return await this.msgServise.create(createDto)
    }

    @Patch('msgId')
    async update(@Param() msgId: string, @Body() updateDto: UpdateDto): Promise<null> {
        return await this.msgServise.update(msgId, updateDto)
    }

    @Delete('msgId')
    async delete(@Param() msgId: string): Promise<null> {
        return await this.msgServise.delete(msgId)
    }
}
