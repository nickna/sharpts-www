using Microsoft.AspNetCore.Localization;

namespace SharpTS.Www.Web.Localization;

/// <summary>
/// Two responsibilities, both keyed off the resolved request culture:
/// <list type="number">
/// <item>
///   <b>Autodetect</b>: a GET for the bare <c>/</c> whose preferred culture (cookie →
///   Accept-Language) is a supported non-default language is 302-redirected to its path
///   prefix (e.g. <c>/fr</c>). English stays at <c>/</c> as the canonical default.
/// </item>
/// <item>
///   <b>Cookie sync</b>: a GET for a culture-prefixed page (e.g. <c>/de</c>) persists the
///   culture cookie. This is what carries the language to the interactive SignalR circuit,
///   which reconnects to <c>/_blazor</c> (no path prefix) and would otherwise fall back to
///   the browser's Accept-Language — breaking shared links like <c>/de</c> opened in an
///   English browser.
/// </item>
/// </list>
/// Must be registered <em>after</em> <c>UseRequestLocalization</c> so the
/// <see cref="IRequestCultureFeature"/> is populated.
/// </summary>
public static class CultureRedirectMiddleware
{
    public static IApplicationBuilder UseCultureRedirect(this IApplicationBuilder app) =>
        app.Use(static async (context, next) =>
        {
            var request = context.Request;

            if (HttpMethods.IsGet(request.Method))
            {
                if (request.Path == "/")
                {
                    var preferred = SupportedCultures.Normalize(
                        context.Features.Get<IRequestCultureFeature>()?.RequestCulture.Culture.Name);

                    if (preferred is not null && preferred != SupportedCultures.Default)
                    {
                        context.Response.Redirect($"/{preferred}{request.QueryString}");
                        return;
                    }
                }
                else if (request.Path.HasValue)
                {
                    var firstSegment = request.Path.Value!.Trim('/').Split('/', 2)[0];
                    var culture = SupportedCultures.Normalize(firstSegment);
                    if (culture is not null)
                    {
                        EnsureCultureCookie(context, culture);
                    }
                }
            }

            await next(context);
        });

    private static void EnsureCultureCookie(HttpContext context, string culture)
    {
        var cookieValue = CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(culture));
        if (context.Request.Cookies[CookieRequestCultureProvider.DefaultCookieName] == cookieValue)
        {
            return; // already in sync — avoid a redundant Set-Cookie on every navigation
        }

        context.Response.Cookies.Append(
            CookieRequestCultureProvider.DefaultCookieName,
            cookieValue,
            BuildCookieOptions(context));
    }

    internal static CookieOptions BuildCookieOptions(HttpContext context) => new()
    {
        Path = "/",
        Expires = DateTimeOffset.UtcNow.AddYears(1),
        IsEssential = true,
        SameSite = SameSiteMode.Lax,
        HttpOnly = true,
        Secure = context.Request.IsHttps,
    };
}
