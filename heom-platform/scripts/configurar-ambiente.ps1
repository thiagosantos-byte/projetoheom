$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Arquivo .env criado a partir de .env.example.' -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'CONFIGURACAO INICIAL DO HEOM' -ForegroundColor Cyan
Write-Host 'O segredo JWT sera gerado localmente e nao sera exibido.'
Write-Host 'Crie uma senha de administrador com pelo menos 14 caracteres.'
Write-Host 'Use letras, numeros e estes simbolos: ! @ # $ % _ -'
Write-Host ''

$securePassword = Read-Host 'Digite a senha inicial do administrador' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ($adminPassword.Length -lt 14 -or $adminPassword -notmatch '^[A-Za-z0-9!@#$%_\-]+$') {
    throw 'Senha invalida. Use pelo menos 14 caracteres e somente letras, numeros ou os simbolos ! @ # $ % _ -.'
}

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
    $jwtSecret = [Convert]::ToBase64String($bytes)
}
finally {
    $rng.Dispose()
}

$lines = Get-Content '.env'
$jwtFound = $false
$passwordFound = $false
$updatedLines = foreach ($line in $lines) {
    if ($line -match '^JWT_SECRET=') {
        $jwtFound = $true
        "JWT_SECRET=$jwtSecret"
    }
    elseif ($line -match '^INITIAL_ADMIN_PASSWORD=') {
        $passwordFound = $true
        ('INITIAL_ADMIN_PASSWORD="{0}"' -f $adminPassword)
    }
    else {
        $line
    }
}

if (-not $jwtFound) { throw 'A chave JWT_SECRET nao foi encontrada no .env.' }
if (-not $passwordFound) { throw 'A chave INITIAL_ADMIN_PASSWORD nao foi encontrada no .env.' }

Set-Content -Path '.env' -Value $updatedLines -Encoding UTF8
$adminPassword = $null
$securePassword.Dispose()

Write-Host ''
Write-Host 'Configuracao concluida.' -ForegroundColor Green
Write-Host 'JWT_SECRET: gerado localmente (nao exibido).'
Write-Host 'INITIAL_ADMIN_PASSWORD: configurada.'
Write-Host 'Agora execute: powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1' -ForegroundColor Yellow
