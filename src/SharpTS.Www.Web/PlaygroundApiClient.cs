using System.Net.Http.Json;

namespace SharpTS.Www.Web;

public class PlaygroundApiClient(HttpClient httpClient)
{
    public async Task<RunResponse?> RunAsync(string source, int timeoutMs = 5000, string? mode = null)
    {
        var request = new RunRequest(source, timeoutMs, mode);
        var response = await httpClient.PostAsJsonAsync("/api/run", request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<RunResponse>();
    }

    public async Task<List<PresetExample>> GetPresetsAsync()
    {
        return await httpClient.GetFromJsonAsync<List<PresetExample>>("/api/presets") ?? [];
    }

    public async Task<PresetExample?> GetPresetAsync(string name)
    {
        return await httpClient.GetFromJsonAsync<PresetExample>($"/api/presets/{Uri.EscapeDataString(name)}");
    }
}

public record RunRequest(string Source, int TimeoutMs = 5000, string? Mode = null);

public record RunResponse(
    bool Success,
    string Output,
    List<ErrorInfo> Errors,
    long ExecutionTimeMs,
    long? CompileTimeMs = null);

public record ErrorInfo(string Message, int? Line, int? Column);

public record PresetExample(string Name, string Description, string Source);
