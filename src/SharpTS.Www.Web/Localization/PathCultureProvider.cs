using Microsoft.AspNetCore.Localization;

namespace SharpTS.Www.Web.Localization;

/// <summary>
/// Resolves the request culture from the first path segment (e.g. <c>/fr</c> → French).
/// Blazor's component routing runs <em>after</em> middleware, so the built-in
/// <see cref="RouteDataRequestCultureProvider"/> has no route values to read at this point —
/// we parse the raw path ourselves. Returns <c>null</c> for the bare <c>/</c> root or any
/// unrecognized prefix, deferring to the cookie / Accept-Language providers.
/// </summary>
public sealed class PathCultureProvider : RequestCultureProvider
{
    public override Task<ProviderCultureResult?> DetermineProviderCultureResult(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        var path = httpContext.Request.Path;
        if (path.HasValue)
        {
            var firstSegment = path.Value!.Trim('/').Split('/', 2)[0];
            var culture = SupportedCultures.Normalize(firstSegment);
            if (culture is not null)
            {
                return Task.FromResult<ProviderCultureResult?>(new ProviderCultureResult(culture, culture));
            }
        }

        return NullProviderCultureResult;
    }
}
