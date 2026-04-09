using namespace System.Drawing
using namespace System.Drawing.Drawing2D
using namespace System.Drawing.Imaging

param(
  [string]$AssetsDir = "assets"
)

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot $AssetsDir
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Get-Color([string]$hex) {
  return [ColorTranslator]::FromHtml($hex)
}

function Add-CurvePath([GraphicsPath]$path, [PointF[]]$points) {
  $path.AddCurve($points, 0.45)
  $path.CloseFigure()
}

function Draw-Mark([Graphics]$graphics, [float]$offsetX, [float]$offsetY, [float]$scale) {
  $state = $graphics.Save()
  $graphics.TranslateTransform($offsetX, $offsetY)
  $graphics.ScaleTransform($scale, $scale)

  $plumDark = Get-Color '#5B214B'
  $plumMid = Get-Color '#7B2F63'
  $plumLight = Get-Color '#B25A8C'

  $leftPath = [GraphicsPath]::new()
  Add-CurvePath $leftPath @(
    [PointF]::new(472, 48),
    [PointF]::new(372, 62),
    [PointF]::new(294, 156),
    [PointF]::new(280, 282),
    [PointF]::new(320, 392),
    [PointF]::new(352, 470),
    [PointF]::new(334, 596),
    [PointF]::new(292, 728),
    [PointF]::new(298, 836),
    [PointF]::new(392, 954),
    [PointF]::new(458, 900),
    [PointF]::new(480, 780),
    [PointF]::new(470, 648),
    [PointF]::new(488, 530),
    [PointF]::new(530, 422),
    [PointF]::new(542, 300),
    [PointF]::new(530, 166),
    [PointF]::new(472, 48)
  )

  $rightPath = [GraphicsPath]::new()
  Add-CurvePath $rightPath @(
    [PointF]::new(556, 118),
    [PointF]::new(644, 126),
    [PointF]::new(730, 224),
    [PointF]::new(726, 356),
    [PointF]::new(700, 480),
    [PointF]::new(640, 576),
    [PointF]::new(596, 688),
    [PointF]::new(566, 784),
    [PointF]::new(576, 878),
    [PointF]::new(606, 958),
    [PointF]::new(532, 920),
    [PointF]::new(478, 810),
    [PointF]::new(474, 676),
    [PointF]::new(502, 560),
    [PointF]::new(568, 438),
    [PointF]::new(618, 336),
    [PointF]::new(620, 206),
    [PointF]::new(556, 118)
  )

  $leftBrush = [LinearGradientBrush]::new(
    [PointF]::new(260, 40),
    [PointF]::new(560, 980),
    $plumLight,
    $plumMid
  )
  $rightBrush = [LinearGradientBrush]::new(
    [PointF]::new(450, 90),
    [PointF]::new(760, 980),
    $plumMid,
    $plumDark
  )

  $graphics.FillPath($leftBrush, $leftPath)
  $graphics.FillPath($rightBrush, $rightPath)

  $mainStroke = [Pen]::new([Color]::White, 34)
  $mainStroke.StartCap = [LineCap]::Round
  $mainStroke.EndCap = [LineCap]::Round

  $secondaryStroke = [Pen]::new([Color]::White, 14)
  $secondaryStroke.StartCap = [LineCap]::Round
  $secondaryStroke.EndCap = [LineCap]::Round

  $accentStroke = [Pen]::new([Color]::White, 10)
  $accentStroke.StartCap = [LineCap]::Round
  $accentStroke.EndCap = [LineCap]::Round

  $graphics.DrawBezier(
    $mainStroke,
    [PointF]::new(588, 168),
    [PointF]::new(530, 256),
    [PointF]::new(522, 454),
    [PointF]::new(452, 900)
  )

  $graphics.DrawBezier(
    $secondaryStroke,
    [PointF]::new(520, 202),
    [PointF]::new(444, 254),
    [PointF]::new(432, 418),
    [PointF]::new(404, 778)
  )

  $graphics.DrawBezier(
    $accentStroke,
    [PointF]::new(438, 232),
    [PointF]::new(470, 258),
    [PointF]::new(500, 262),
    [PointF]::new(536, 222)
  )

  $accentPath = [GraphicsPath]::new()
  Add-CurvePath $accentPath @(
    [PointF]::new(455, 194),
    [PointF]::new(438, 204),
    [PointF]::new(430, 228),
    [PointF]::new(446, 252),
    [PointF]::new(466, 248),
    [PointF]::new(478, 228),
    [PointF]::new(476, 204),
    [PointF]::new(455, 194)
  )
  $graphics.FillPath([SolidBrush]::new([Color]::White), $accentPath)

  $leftPath.Dispose()
  $rightPath.Dispose()
  $leftBrush.Dispose()
  $rightBrush.Dispose()
  $mainStroke.Dispose()
  $secondaryStroke.Dispose()
  $accentStroke.Dispose()
  $accentPath.Dispose()

  $graphics.Restore($state)
}

function New-Canvas([int]$width, [int]$height, [Color]$background) {
  $bitmap = [Bitmap]::new($width, $height, [PixelFormat]::Format32bppArgb)
  $graphics = [Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [CompositingQuality]::HighQuality
  $graphics.Clear($background)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Ico([string]$pngPath, [string]$icoPath) {
  $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
  $stream = [System.IO.File]::Create($icoPath)
  $writer = [System.IO.BinaryWriter]::new($stream)

  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$pngBytes.Length)
  $writer.Write([UInt32]22)
  $writer.Write($pngBytes)
  $writer.Flush()
  $writer.Dispose()
  $stream.Dispose()
}

$iconCanvas = New-Canvas 512 512 ([Color]::Transparent)
Draw-Mark $iconCanvas.Graphics 8 18 0.50
$iconPath = Join-Path $outputDir 'icon.png'
$iconCanvas.Bitmap.Save($iconPath, [ImageFormat]::Png)
$iconCanvas.Graphics.Dispose()
$iconCanvas.Bitmap.Dispose()

$logoCanvas = New-Canvas 1200 1200 ([Color]::White)
Draw-Mark $logoCanvas.Graphics 132 48 0.94

$titleColor = Get-Color '#5B214B'
$titleBrush = [SolidBrush]::new($titleColor)
$font = [Font]::new('Times New Roman', 108, [FontStyle]::Regular, [GraphicsUnit]::Pixel)
$stringFormat = [StringFormat]::new()
$stringFormat.Alignment = [StringAlignment]::Center
$stringFormat.LineAlignment = [StringAlignment]::Center
$logoCanvas.Graphics.DrawString(
  'LUCY LARA',
  $font,
  $titleBrush,
  [RectangleF]::new(0, 930, 1200, 160),
  $stringFormat
)

$logoPath = Join-Path $outputDir 'logo-card.png'
$logoCanvas.Bitmap.Save($logoPath, [ImageFormat]::Png)
$titleBrush.Dispose()
$font.Dispose()
$stringFormat.Dispose()
$logoCanvas.Graphics.Dispose()
$logoCanvas.Bitmap.Dispose()

$icoPath = Join-Path $outputDir 'icon.ico'
Save-Ico $iconPath $icoPath

Write-Host "Generated branding assets in $outputDir"
