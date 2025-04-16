import { SetMetadata } from '@nestjs/common'

export const GEO_ENABLED_KEY = 'geoEnabled'

export const GeoEnabled = () => SetMetadata(GEO_ENABLED_KEY, true)
