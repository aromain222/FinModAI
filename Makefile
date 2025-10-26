APP=finmodai-z9qvtg
REGION=iad
TAG?=$(shell date +%Y%m%d%H%M%S)

.PHONY: fly:login fly:region fly:secrets fly:deploy:image fly:status fly:checks fly:logs

fly:login:
	flyctl auth login

fly:region:
	flyctl regions set $(REGION) -a $(APP) || true

fly:secrets:
	flyctl secrets set \
		DATA_MODE=production \
		DATA_STALENESS_MAX_MIN=30 \
		REQUIRE_MIN_FUND_YEARS=3 \
		-a $(APP)

fly:deploy:image:
	# Prebuild & push image to Fly registry, then deploy by image
	flyctl auth docker
	docker buildx build --platform linux/amd64 -t registry.fly.io/$(APP):$(TAG) -f backend/Dockerfile --push .
	flyctl deploy -a $(APP) --image registry.fly.io/$(APP):$(TAG) --strategy immediate

fly:status:
	flyctl status -a $(APP)

fly:checks:
	flyctl checks list -a $(APP)

fly:logs:
	flyctl logs -a $(APP) --since 15m


