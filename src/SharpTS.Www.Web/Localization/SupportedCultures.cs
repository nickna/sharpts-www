namespace SharpTS.Www.Web.Localization;

/// <summary>
/// Single source of truth for the languages the site ships in. Consumed by the
/// localization middleware/providers, the <c>Home</c> route validation, and the
/// language selector. English is the neutral/default culture and lives at the bare
/// <c>/</c> path; every other culture is reachable under a path prefix (e.g. <c>/fr</c>).
/// </summary>
public static class SupportedCultures
{
    public const string Default = "en";

    /// <summary>Supported cultures, default first. Order is reflected in the language selector.</summary>
    public static readonly string[] All = ["en", "zh-Hans", "fr", "es", "de"];

    /// <summary>Display names shown in the language selector, keyed by culture.</summary>
    public static readonly IReadOnlyDictionary<string, string> DisplayNames = new Dictionary<string, string>
    {
        ["en"] = "English",
        ["zh-Hans"] = "简体中文",
        ["fr"] = "Français",
        ["es"] = "Español",
        ["de"] = "Deutsch",
    };

    /// <summary>
    /// OpenGraph <c>og:locale</c> values (the spec wants <c>language_TERRITORY</c>, e.g.
    /// <c>fr_FR</c>), keyed by culture.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> OpenGraphLocales = new Dictionary<string, string>
    {
        ["en"] = "en_US",
        ["zh-Hans"] = "zh_CN",
        ["fr"] = "fr_FR",
        ["es"] = "es_ES",
        ["de"] = "de_DE",
    };

    /// <summary>Returns the OpenGraph locale for a culture, falling back to the default's.</summary>
    public static string OpenGraphLocale(string? culture) =>
        OpenGraphLocales.TryGetValue(Normalize(culture) ?? Default, out var locale) ? locale : "en_US";

    public static bool IsSupported(string? culture) => Normalize(culture) is not null;

    /// <summary>
    /// Returns the canonical casing of <paramref name="culture"/> if it is supported
    /// (case-insensitive match, so a lowercase URL segment like <c>zh-hans</c> resolves),
    /// otherwise <c>null</c>.
    /// </summary>
    public static string? Normalize(string? culture)
    {
        if (string.IsNullOrWhiteSpace(culture))
        {
            return null;
        }

        foreach (var supported in All)
        {
            if (string.Equals(supported, culture, StringComparison.OrdinalIgnoreCase))
            {
                return supported;
            }
        }

        return null;
    }
}
