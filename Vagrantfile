# Tiling Shell: advanced and modern window management for GNOME
#
# Copyright (C) 2025 Domenico Ferraro
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>
#
# SPDX-License-Identifier: GPL-3.0-or-later

require 'pathname'

CPUS = 4
MEMORY = 4096
PROJECT_DIR = Pathname.new(__FILE__).realpath.dirname
SYNCED_FOLDER = "/home/vagrant/#{PROJECT_DIR.basename}"
UUID = "tilingshell@ferrarodomenico.com"

# Shared configuration for all GNOME VMs
def configure_gnome_vm(vm_config, box_name)
  vm_config.vm.box = box_name

  vm_config.vm.provider :virtualbox do |v|
    v.gui = true
    v.cpus = CPUS
    v.memory = MEMORY
    v.customize ["modifyvm", :id, "--vram=128"]
    v.customize ["modifyvm", :id, "--accelerate-3d", "on"]
    v.customize ["setextradata", :id, "GUI/LastGuestSizeHint", "1920,1080"]
    v.customize ["modifyvm", :id, "--clipboard", "bidirectional"]
    v.default_nic_type = "virtio"
  end

  # One-time system setup
  vm_config.vm.provision 'install-deps', type: 'shell', privileged: true, run: 'once', inline: <<-SCRIPT
      echo 'fastestmirror=1' | sudo tee -a /etc/dnf/dnf.conf
      echo 'max_parallel_downloads=10' | sudo tee -a /etc/dnf/dnf.conf
      echo 'deltarpm=true' | sudo tee -a /etc/dnf/dnf.conf

      dnf -y update
      dnf install -y gnome-shell gnome-session gdm \
          gnome-extensions-app gnome-terminal \
          nautilus gnome-backgrounds nodejs npm

      passwd --delete vagrant

      # Enable GDM autologin
      systemctl enable gdm
      systemctl set-default graphical.target
      mkdir -p /etc/gdm
      cat <<EOF > /etc/gdm/custom.conf
[daemon]
AutomaticLoginEnable=True
AutomaticLogin=vagrant
EOF
      systemctl restart gdm

      # Install extension dependencies
      echo "🛠️ Installing npm dependencies..."
      cd #{SYNCED_FOLDER}
      npm install
  SCRIPT

  # Build extension
  vm_config.vm.provision "build-extension", type: "shell", privileged: true, run: "always", inline: <<-SCRIPT
      set -e
      cd #{SYNCED_FOLDER}
      echo "🛠️ Installing npm dependencies and building the extension..."
      npm install
      npm run build
  SCRIPT

  # Install extension
  vm_config.vm.provision "install-extension", type: "shell", privileged: false, run: "always", inline: <<-SCRIPT
      set -e
      EXT_DIR="$HOME/.local/share/gnome-shell/extensions/#{UUID}"
      rm -rf "$EXT_DIR"
      cd #{SYNCED_FOLDER}
      npm run install:extension
  SCRIPT

  # Reload GNOME
  vm_config.vm.provision "reload", type: "shell", privileged: true, run: "always", inline: <<-SCRIPT
      set -e
      echo "⏳ Restarting GDM to reload GNOME Shell..."
      systemctl restart gdm
  SCRIPT

  # Enable extension once
  vm_config.vm.provision "enable-extension", type: "shell", privileged: false, run: "once", inline: <<-SCRIPT
      set -e
      echo "🚀 Enabling extension..."
      gnome-extensions enable #{UUID}
  SCRIPT

  # Debug logs (manual)
  vm_config.vm.provision "show-logs", type: "shell", run: "never", inline: <<-SCRIPT
      journalctl --follow /usr/bin/gnome-shell
  SCRIPT
end

Vagrant.configure("2") do |config|
  # Shared synced folder
  config.vm.synced_folder '.', SYNCED_FOLDER,
    type: 'rsync',
    rsync__exclude: [".git/", "node_modules/", "dist/", "dist_legacy/", "*.zip", "doc/"],
    rsync__args: ['-avcS'],
    rsync__auto: true

  # GNOME 44 on Fedora 38
  config.vm.define "gnome44" do |gnome44|
    configure_gnome_vm(gnome44, "bento/fedora-38")
  end

  # GNOME 46 on Fedora 40
  config.vm.define "gnome46", primary: true do |gnome46|
    configure_gnome_vm(gnome46, "bento/fedora-40")
  end

  # GNOME 47 on Fedora 41
  config.vm.define "gnome47", primary: true do |gnome46|
    configure_gnome_vm(gnome46, "bento/fedora-41")
  end

  # GNOME 48 on Fedora 42
  config.vm.define "gnome48" do |gnome48|
    configure_gnome_vm(gnome48, "bento/fedora-42")
  end

  # GNOME 49 on Fedora 43
  config.vm.define "gnome49" do |gnome49|
    configure_gnome_vm(gnome49, "bento/fedora-43")
  end
end

