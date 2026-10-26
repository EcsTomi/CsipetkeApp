import { ImageLoaderConfig } from '@angular/common';
import { environment } from '@env/environments';

// A statikus kiszolgálás Traefik-en/nginx-en megy, NEM a FastAPI-n keresztül.
// environment.archiveImgUrl-t vedd fel az env fájlokba, pl. 'https://csipetke.hu/img/archive'
const ARCHIVE_IMG_BASE = environment.archiveImgUrl;

export function archiveImageLoader(config: ImageLoaderConfig): string {
    const width = config.width ?? 960;
    const label = width <= 320 ? 'thumb' : width <= 960 ? 'medium' : 'full';
    return `${ARCHIVE_IMG_BASE}/${config.src}_${label}.webp`;
}