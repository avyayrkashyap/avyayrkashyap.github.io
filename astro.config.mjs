import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  integrations: [react()],
  // The dev toolbar sits bottom-center, on top of the dock, and its invisible
  // hover area swallows taps on the theme toggle and socials in `astro dev`
  devToolbar: { enabled: false },
});
