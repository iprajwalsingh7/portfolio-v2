package com.prajwalsingh.portfolio.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC configuration.
 *
 * Static cache policy deliberately lives in {@link CacheHeadersFilter} rather
 * than here. Resource handlers registered from a WebMvcConfigurer share one
 * registry with the `/**` handler Boot registers itself, and the winner is
 * decided by registration order — which is not something this app should depend
 * on. A filter keyed on the request path is explicit and order-independent.
 *
 * There is no custom task executor either: `spring.threads.virtual.enabled=true`
 * already makes Boot's `applicationTaskExecutor` virtual-thread backed, so
 * defining another bean with that name only risks a clash.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;

    public WebConfig(AppProperties props) {
        this.props = props;
    }

    /** Dev only: the Vite server runs on a different origin. */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.cors().allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "OPTIONS")
                .maxAge(3600);
    }
}
