// Test-only fixed-argv CLI. It reads a disposable fixture, never real app state.
using System;
using System.IO;
class StackbiteAttention {
    static int Main(string[] args) {
        if(Environment.GetEnvironmentVariable("OPENROUTER_API_KEY")!=null)return 3;
        if(args.Length!=4||args[0]!="agent"||args[1]!="seats"||args[2]!="--output"||args[3]!="json")return 2;
        Console.WriteLine(File.ReadAllText(Path.Combine(Environment.GetEnvironmentVariable("STACKBITE_STATE_DIR"),"attention-fixture.json")));
        return 0;
    }
}
