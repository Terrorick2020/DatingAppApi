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
import { successResponse, errorResponse } from '@/common/helpers/api.response.helper'
import type { ResUpdatedChat, ResCreateChat, ResFindAllChats } from './chats.types'

@Controller('chats')
export class ChatsController {
    constructor( private readonly chatsService: ChatsService ) {}

    @Get()
    async findAll(@Body() findDto: FindDto): Promise<ResFindAllChats[]> {
        return await this.chatsService.findAll(findDto)
    }

    @Post()
    async create(@Body() creatDto: CreateDto): Promise<ResCreateChat> {
        return await this.chatsService.create(creatDto)
    }

    @Patch(':chatId')
    async update(@Param('chatId') chatId: string, @Body() updateDto: UpdateDto): Promise<ResUpdatedChat> {
        return await this.chatsService.update(chatId, updateDto)
    }

    @Delete(':chatId')
    async delete(@Param('chatId') chatId: string): Promise<typeof successResponse | typeof errorResponse> {
        return await this.chatsService.delete(chatId)
    }
}
