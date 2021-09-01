if [ -d "/var/app/current/dependencies/fonts/nunito" ]; then
  sudo cp -r /var/app/current/dependencies/fonts/nunito /usr/share/fonts;
  sudo fc-cache -fv;
  echo "Installed fonts.";
else
  echo "Skipping font installation. Not running on EC2.";
fi
