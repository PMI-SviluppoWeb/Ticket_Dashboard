# Avvia Hermes Agent con l'API server attivo (integrazione Ticket Dashboard).
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\start-hermes-gateway.ps1
#
# Perche' uno script? Le variabili API_SERVER_* in ~/.hermes/.env non vengono
# ereditate dal processo gateway in alcuni percorsi di avvio: qui le si carica
# esplicitamente nell'env del processo, poi si lancia `hermes gateway run`.
# Interrompere con Ctrl+C; in produzione il gateway va gestito come servizio.

$ErrorActionPreference = "Stop"

$hermesEnv = Join-Path $env:USERPROFILE ".hermes\.env"
if (-not (Test-Path $hermesEnv)) {
    Write-Error "Trovato $hermesEnv: configura prima API_SERVER_ENABLED/API_SERVER_KEY (vedi DEPLOY.md sezione 10)."
    exit 1
}

# Carica il file env nel processo (ignora commenti/righe vuote)
Get-Content $hermesEnv | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $idx = $line.IndexOf("=")
        if ($idx -gt 0) {
            $name = $line.Substring(0, $idx).Trim()
            $value = $line.Substring($idx + 1).Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

if ($env:API_SERVER_ENABLED -ne "true" -or -not $env:API_SERVER_KEY) {
    Write-Error "API_SERVER_ENABLED=true e API_SERVER_KEY sono obbligatori in $hermesEnv"
    exit 1
}

$port = $env:API_SERVER_PORT
if (-not $port) { $port = "8642" }

Write-Host "Hermes gateway con API server (porta $port)..."
Write-Host "Health check: curl http://127.0.0.1:$port/health"
Write-Host ""

hermes gateway run
