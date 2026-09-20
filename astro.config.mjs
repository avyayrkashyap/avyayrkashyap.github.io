import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
// Dev only: adds the endpoint the paragraph editor writes through. Its hooks
// run in `astro dev`, so it contributes nothing to a production build.
import devTextEditor from './src/dev/text-editor/integration.mjs';
export default defineConfig({
  integrations: [react(), devTextEditor()],
  // The dev toolbar sits bottom-center, on top of the dock, and its invisible
  // hover area swallows taps on the theme toggle and socials in `astro dev`
  devToolbar: { enabled: false },
});
