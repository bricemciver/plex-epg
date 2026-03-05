# Plex EPG OTA Makefile

# Build the Docker image
build:
	docker build -t plex-epg .

# Run the container
run:
	docker run -p 3000:3000 \
	  -e ZIP_CODE=$(ZIP_CODE) \
	  -e PLEX_URL=$(PLEX_URL) \
	  -e PLEX_TOKEN=$(PLEX_TOKEN) \
	  plex-epg

# Enter the running container
exec:
	docker exec -it plex-epg /bin/bash

# Show logs for the running container
logs:
  docker logs -f plex-epg

# Show the container version
version:
  docker inspect -f '{{ index .Config.Labels "build_version" }}' plex-epg

# Stop and remove the container
stop:
	docker stop plex-epg
	docker rm plex-epg

# Remove the image
clean:
	docker image rm plex-epg
	docker image prune
