/** Exclude dompurify from source-map-loader (maps reference unpublished src/*.ts). */
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const dompurifyExclude = /node_modules[/\\]dompurify/;
      webpackConfig.module.rules.forEach((rule) => {
        const isSourceMapLoader =
          (typeof rule.loader === 'string' &&
            rule.loader.includes('source-map-loader')) ||
          (Array.isArray(rule.use) &&
            rule.use.some(
              (u) =>
                u &&
                typeof u === 'object' &&
                u.loader &&
                u.loader.includes('source-map-loader')
            ));
        if (!isSourceMapLoader) return;

        const prev = rule.exclude;
        if (!prev) {
          rule.exclude = [dompurifyExclude];
        } else if (Array.isArray(prev)) {
          rule.exclude = [...prev, dompurifyExclude];
        } else {
          rule.exclude = [prev, dompurifyExclude];
        }
      });
      return webpackConfig;
    },
  },
};
