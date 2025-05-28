import { Body, Controller, Post } from '@nestjs/common'
import { GeoService } from './geo.service'
import { SetGeoDto } from './dto/set-geo.dto'

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

	@Post('set-geo')
	async setGeo(@Body() setGeoDto: SetGeoDto): Promise<any> {
		return this.geoService.getCityByCoordinates(setGeoDto)
	}
}