VERSION=0.1
TAG=makeshiftsoftware/vsnet-matchmaker:$(VERSION)

mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_path := $(dir $(mkfile_path))

build:
	docker build -f Dockerfile.dev --tag $(TAG) $(current_path)

push:
	docker push $(TAG)

clean:
	docker rmi $(TAG)