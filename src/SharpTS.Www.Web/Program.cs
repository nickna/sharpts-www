using Microsoft.AspNetCore.Localization;
using SharpTS.Www.ServiceDefaults;
using SharpTS.Www.Web;
using SharpTS.Www.Web.Components;
using SharpTS.Www.Web.Localization;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");

var apiBaseUrl = builder.Configuration["ApiBaseUrl"] ?? "https+http://api";
builder.Services.AddHttpClient<PlaygroundApiClient>(client =>
{
    client.BaseAddress = new(apiBaseUrl);
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

// Resolve culture from (in order) the URL path prefix, the culture cookie, then the
// browser's Accept-Language header — then redirect/persist as needed (see middleware).
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture(SupportedCultures.Default)
    .AddSupportedCultures(SupportedCultures.All)
    .AddSupportedUICultures(SupportedCultures.All);
localizationOptions.RequestCultureProviders =
[
    new PathCultureProvider(),
    new CookieRequestCultureProvider(),
    new AcceptLanguageHeaderRequestCultureProvider(),
];

app.UseRequestLocalization(localizationOptions);
app.UseCultureRedirect();

app.UseHttpsRedirection();
app.UseAntiforgery();
app.UseStaticFiles();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// Sets the culture cookie (server-side, including for English) and redirects to the
// chosen language's home. The language selector navigates here with a full reload so the
// new culture flows into a fresh prerender + circuit.
app.MapGet("/set-culture", (string culture, HttpContext context) =>
{
    var normalized = SupportedCultures.Normalize(culture) ?? SupportedCultures.Default;
    context.Response.Cookies.Append(
        CookieRequestCultureProvider.DefaultCookieName,
        CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(normalized)),
        CultureRedirectMiddleware.BuildCookieOptions(context));

    var target = normalized == SupportedCultures.Default ? "/" : $"/{normalized}";
    return Results.Redirect(target);
});

app.MapDefaultEndpoints();

app.Run();
