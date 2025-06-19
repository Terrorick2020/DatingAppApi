import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Query,
	UseGuards,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'
import { FindAllUsersDto } from './dto/find-all-users.dto'
import { FindQuestsQueryDto } from './dto/find-quests.dto'
import { ApiOperation, ApiResponse } from '@nestjs/swagger'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { DeleteUserDto } from './dto/delete-user.dto'
import type { ApiResponse as ApiRes } from '@/common/interfaces/api-response.interface'
import type { QuestItem } from './interfaces/quests.interface'
import { SearchUserDto } from './dto/search-user.dto'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get()
	async findAll(@Query() queryParams: FindAllUsersDto) {
		return this.userService.findAll(queryParams)
	}

	@Get('quests')
	async findQuests(@Query() queryParams: FindQuestsQueryDto): Promise<ApiRes<QuestItem[]>> {
		return await this.userService.findQuests(queryParams)
	}

	@Patch(':telegramId')
	async update(@Param('telegramId') telegramId: string, @Body() dto: UpdateUserDto) {
		return this.userService.update(telegramId, dto)
	}

	@AdminOnly()
	@Delete(':telegramId')
	async remove(@Param('telegramId') telegramId: string) {
		return this.userService.remove(telegramId)
	}

	@ApiOperation({ summary: 'Удаление пользователя и всех связанных данных' })
	@ApiResponse({
		status: 200,
		description: 'Пользователь успешно удален',
	})
	@ApiResponse({
		status: 404,
		description: 'Пользователь не найден',
	})
	@UseGuards(UserStatusGuard)
	@AdminOnly()
	@Delete('delete-user')
	async deleteUser(@Body() deleteUserDto: DeleteUserDto) {
		return this.userService.deleteUser(deleteUserDto)
	}

	@ApiOperation({ summary: 'Самоудаление пользователя' })
	@ApiResponse({
		status: 200,
		description: 'Ваш аккаунт успешно удален',
	})
	@UseGuards(UserStatusGuard)
	@Delete('delete-self/:telegramId')
	async deleteSelf(@Param('telegramId') telegramId: string) {
		return this.userService.deleteUser({
			telegramId,
			reason: 'Самоудаление пользователя',
		})
	}

	@Get(':telegramId')
	async findByTelegramId(@Param('telegramId') telegramId: string) {
		return this.userService.findByTelegramId(telegramId)
	}

	@Get('public/:telegramId')
	async getPublicProfile(@Param('telegramId') telegramId: string) {
		return this.userService.getPublicProfile(telegramId)
	}

	@Get('search')
	async searchUsers(@Query('query') query: SearchUserDto) {
		return this.userService.searchUsers(query.searchText);
	}
}
