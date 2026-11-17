import type { CapacitorConfig } from '@capacitor/cli';

// The phone app (Capacitor): the built pages (web/dist) inside a native app, calling sprig-family.com
// (web/src/lib/native.ts). `npm run ios` builds them and opens Xcode.
const config: CapacitorConfig = {
	appId: 'com.sprigfamily.app',
	appName: 'Sprig',
	webDir: 'web/dist',
	ios: {
		// The pages leave room for the notch and home bar themselves (viewport-fit=cover).
		contentInset: 'never',
		// Behind the pages while they load: the light page color (app.css --bg), like the launch screen.
		backgroundColor: '#f6f5f2',
	},
	plugins: {
		// An alert that comes while Sprig is open shows as a banner too, as it would with Sprig closed.
		PushNotifications: { presentationOptions: ['banner', 'list', 'sound'] },
	},
};

export default config;
