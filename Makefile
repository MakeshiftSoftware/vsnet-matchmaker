TAG_DEV=${DOCKER_ID_USER}/vsnet-matchmaker-dev

build-dev:
	docker build -f Dockerfile.dev --tag $(TAG_DEV) .

push-dev:
	docker push $(TAG_DEV)

clean-dev:
	docker rmi $(TAG_DEV)

pull-dev:
	docker pull $(TAG_DEV)