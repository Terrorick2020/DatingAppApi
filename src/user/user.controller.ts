import type { ApiResponse as ApiRes } from '@/common/interfaces/api-response.interface'
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Query,
} from '@nestjs/common'
import { ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { DeleteUserDto } from './dto/delete-user.dto'
import { FindAllUsersDto } from './dto/find-all-users.dto'
import { FindQuestsQueryDto } from './dto/find-quests.dto'
import { SearchUserDto } from './dto/search-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import type { QuestItem } from './interfaces/quests.interface'
import { UserService } from './user.service'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get()
	async findAll(@Query() queryParams: FindAllUsersDto) {
		return this.userService.findAll(queryParams)
	}

	@Get('quests')
	async findQuests(
		@Query() queryParams: FindQuestsQueryDto
	): Promise<ApiRes<QuestItem[]>> {
		return await this.userService.findQuests(queryParams)
	}

	@Patch(':telegramId')
	async update(
		@Param('telegramId') telegramId: string,
		@Body() dto: UpdateUserDto
	) {
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
	// @UseGuards(UserStatusGuard)
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
	// @UseGuards(UserStatusGuard)
	@Delete('delete-self/:telegramId')
	async deleteSelf(@Param('telegramId') telegramId: string) {
		return this.userService.deleteUser({
			telegramId,
			reason: 'Самоудаление пользователя',
		})
	}

	@Delete('test-delete/:telegramId')
	async testDelete(@Param('telegramId') telegramId: string) {
		try {
			await this.userService.remove(telegramId)
			return { success: true, message: 'Пользователь удален' }
		} catch (error: any) {
			return { success: false, error: error.message }
		}
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
		return this.userService.searchUsers(query.searchText)
	}
}
