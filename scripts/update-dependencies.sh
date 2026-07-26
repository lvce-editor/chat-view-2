#!/bin/bash

cd $(dirname "$0")
cd ..

command_exists(){
  command -v "$1" &> /dev/null
}

if ! command_exists "ncu"; then
    echo "npm-check-updates is not installed"
    npm i -g npm-check-updates
else
    echo "ncu is installed"
fi

function updateDependencies {
  echo "updating dependencies..."
  ncu -u -x typescript
}

updateDependencies

for package_dir in packages/*; do
  if [[ -f "$package_dir/package.json" ]]; then
    (
      cd "$package_dir"
      updateDependencies
    )
  fi
done

nice npm install

echo "Great Success!"

sleep 2
