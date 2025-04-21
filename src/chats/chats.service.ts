import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'

@Injectable()
export class ChatsService {
    constructor( private prisma: PrismaService ) {}

    async findAll(findDto: FindDto): Promise<null> {
        return null
    }

    async create(createDto: CreateDto): Promise<null> {
        return null
    }

    async update(chatId: string, updateDto: UpdateDto): Promise<null> {
        return null
    }

    async delete(chatId: string): Promise<null> {
        return null
    }
}
