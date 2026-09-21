#!/usr/bin/env bash
# Optimize the owner's source clips and process the generated audio locally.
# Requires ffmpeg, cwebp, and the generated bonsai-eleven-loop.mp3 artifact.
set -euo pipefail
media_tmp=$(mktemp -d)
trap 'rm -rf "$media_tmp"' EXIT
for kind in ramen bonsai mars; do
  source_file="external_assets/$kind.mp4"
  if [[ "$kind" == mars ]]; then source_file=external_assets/video_billboard_mars.mp4; fi
  ffmpeg -hide_banner -loglevel error -i "$source_file" -map 0:v:0 -an -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -y "public/circuits/kairo-$kind.mp4"
  ffmpeg -hide_banner -loglevel error -ss 2 -i "$source_file" -map 0:v:0 -frames:v 1 -y "$media_tmp/$kind.png"
  cwebp -quiet -q 85 "$media_tmp/$kind.png" -o "public/circuits/kairo-$kind-poster.webp"
done
ffmpeg -hide_banner -loglevel error -i external_assets/ramen.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 128k -map_metadata -1 -y public/circuits/kairo-ramen-audio.mp3
ffmpeg -hide_banner -loglevel error -i external_assets/video_billboard_mars.mp4 -map 0:a:0 -vn -af 'highpass=f=420,lowpass=f=3200,equalizer=f=1600:t=q:w=1.2:g=5,volume=2.2,asoftclip=type=tanh,aecho=0.8:0.7:135|310|570:0.3|0.18|0.1,loudnorm=I=-18:TP=-2:LRA=6,apad,atrim=duration=10.041667' -c:a libmp3lame -b:a 128k -map_metadata -1 -y public/circuits/kairo-mars-megaphone.mp3
ffmpeg -hide_banner -loglevel error -i artifacts/kairo-shamisen/bonsai-eleven-loop.mp3 -af 'loudnorm=I=-17:TP=-2:LRA=7,afade=t=in:d=0.015,afade=t=out:st=21.985:d=0.015' -c:a libmp3lame -b:a 128k -map_metadata -1 -y public/circuits/kairo-bonsai-music.mp3
