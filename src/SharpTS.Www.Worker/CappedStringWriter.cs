using System.Text;

/// <summary>
/// A StringWriter that caps output at a maximum length to prevent memory exhaustion.
/// </summary>
internal sealed class CappedStringWriter : StringWriter
{
    private readonly int _maxLength;
    private readonly StringBuilder _sb;
    private bool _capped;

    public CappedStringWriter(StringBuilder sb, int maxLength) : base(sb)
    {
        _sb = sb;
        _maxLength = maxLength;
    }

    public override void Write(char value)
    {
        if (_capped) return;
        if (_sb.Length >= _maxLength) { _capped = true; _sb.AppendLine("\n[Output truncated]"); return; }
        base.Write(value);
    }

    public override void Write(string? value)
    {
        if (_capped || value is null) return;
        if (_sb.Length + value.Length > _maxLength) { _capped = true; _sb.AppendLine("\n[Output truncated]"); return; }
        base.Write(value);
    }
}
