import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { canGoBack } from './usePage';

// Android's own Back (the button, or the swipe in from either edge): back through the same steps as
// Sprig's ‹ Back and the iPhone's swipe (usePage, useBackStep); with nowhere to go back to, Sprig goes
// into the background, as Android apps do. Nothing on an iPhone or the web.
if (Capacitor.getPlatform() === 'android') {
	void App.addListener('backButton', () => {
		if (canGoBack()) history.back();
		else void App.minimizeApp();
	});
}
