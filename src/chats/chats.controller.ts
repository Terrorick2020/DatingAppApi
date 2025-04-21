import {
    Controller,
    Get,
    Post,
    Param,
	Patch,
    Body,
    Delete,
} from '@nestjs/common'
import { ChatsService } from './chats.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'

@Controller('chats')
export class ChatsController {
    constructor( private readonly chatsService: ChatsService ) {}

    @Get()
    async findAll(@Body() findDto: FindDto): Promise<null> {
        return await this.chatsService.findAll(findDto)
    }

    @Post()
    async create(@Body() creatDto: CreateDto): Promise<null> {
        return await this.chatsService.create(creatDto)
    }

    @Patch(':chatId')
    async update(@Param('chatId') chatId: string, @Body() updateDto: UpdateDto): Promise<null> {
        return await this.chatsService.update(chatId, updateDto)
    }

    @Delete(':chatId')
    async delete(@Param('chatId') chatId: string): Promise<null> {
        return await this.chatsService.delete(chatId)
    }
}
