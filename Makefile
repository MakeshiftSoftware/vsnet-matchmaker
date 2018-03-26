VERSION=0.1
TAG=makeshiftsoftware/vsnet-matchmaker:$(VERSION)

mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_path := $(dir $(mkfile_path))

build:
	docker build -f Dockerfile.dev --tag $(TAG) .

push:
	docker push $(TAG)

clean:
	docker rmi $(TAG)

deploy-all: deploy-redis-store deploy-redis-pubsub deploy-rs deploy-service

deploy-rs:
	kubectl apply -f $(current_path)infrastructure/dev/deployment.yaml

deploy-service:
	kubectl apply -f $(current_path)infrastructure/dev/service.yaml

deploy-redis-store:
	kubectl create -f $(current_path)infrastructure/dev/redis-store.yaml

deploy-redis-pubsub:
	kubectl create -f $(current_path)infrastructure/dev/redis-pubsub.yaml