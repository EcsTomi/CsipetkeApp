const API_MAP: Record<string, string> = {
	'csipetke.lovassy.hu': 'https://csipetke.lovassy.hu',
	'csipetke.etomi.hu': 'https://csipetke.etomi.hu',
};

const currentHost = window.location.hostname;
const rootUrl = API_MAP[currentHost] ?? 'https://csipetke.etomi.hu';
const apiUrl = `${rootUrl}/api`;
const redirectUrl = `${rootUrl}`;
const archiveImgUrl = `${rootUrl}/img/archive`;

export const environment = {
	production: true,
	apiUrl,
	redirectUrl,
	archiveImgUrl
};