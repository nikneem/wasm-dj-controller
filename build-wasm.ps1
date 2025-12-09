# Build script for WASM audio engine
# This script builds the Rust WASM module and copies it to the Angular project

Write-Host "Building WASM audio engine..." -ForegroundColor Cyan

# Build the WASM module
Set-Location "d:\projects\github.com\nikneem\wasm-dj-controller\src\audio-engine"
cargo build --target wasm32-unknown-unknown --release

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ WASM build successful" -ForegroundColor Green
    
    # Create output directory
    $outputDir = "d:\projects\github.com\nikneem\wasm-dj-controller\src\dj-controller\public\wasm"
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    
    # Copy WASM file
    $wasmSource = "target\wasm32-unknown-unknown\release\audio_engine.wasm"
    $wasmDest = "$outputDir\audio_engine.wasm"
    Copy-Item $wasmSource $wasmDest -Force
    
    $size = [math]::Round((Get-Item $wasmDest).Length / 1KB, 2)
    Write-Host "✓ WASM file copied: $size KB" -ForegroundColor Green
    
    Write-Host "`nBuild complete! WASM module ready at:" -ForegroundColor Green
    Write-Host "  $wasmDest" -ForegroundColor Yellow
}
else {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}
